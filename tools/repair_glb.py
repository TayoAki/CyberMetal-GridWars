# Repair a rigged GLB whose skeleton came out broken, and slim it down for the web.
#   python3 -I tools/repair_glb.py <in.glb> <out.glb> [texture_size]
#
# Tripo's auto-rig export of the player mech had a 65-bone Mixamo-named skeleton with valid skin weights, but
# every bone sat at the origin and the inverse bind matrices were garbage (values up to 1e37), so posing it
# sent vertices to infinity. The weights are good, so the joints can be recovered from them: a joint sits
# where its bone's influence blends into its parent's, so each joint is placed at the centroid of the
# vertices weighted to both. The rest pose becomes pure translations (the mesh is in a T-pose), and the
# inverse bind matrices are rebuilt from it. The 4096x4096 base colour texture is also downsized.
# Needs Pillow for the texture.
import io
import json
import struct
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
tex_size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
data = open(src, 'rb').read()
magic, version, _ = struct.unpack_from('<4sII', data, 0)
assert magic == b'glTF' and version == 2, 'not a glTF 2 binary'
jlen = struct.unpack_from('<I', data, 12)[0]
gl = json.loads(data[20:20 + jlen])
bin_start = 20 + jlen + 8
binary = data[bin_start:]

COMP = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
COUNT = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def view_bytes(i):
    bv = gl['bufferViews'][i]
    o = bv.get('byteOffset', 0)
    return binary[o:o + bv['byteLength']]


def read(ai):
    a = gl['accessors'][ai]
    bv = gl['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = COUNT[a['type']]
    stride = bv.get('byteStride', size * n)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * n, binary, base + i * stride) for i in range(a['count'])]


prim = gl['meshes'][0]['primitives'][0]
positions = read(prim['attributes']['POSITION'])
joints = read(prim['attributes']['JOINTS_0'])
weights = read(prim['attributes']['WEIGHTS_0'])
skin = gl['skins'][0]
joint_nodes = skin['joints']
slot = {node: i for i, node in enumerate(joint_nodes)}
parent_node = {c: p for p, n in enumerate(gl['nodes']) for c in n.get('children', [])}
parent = [slot.get(parent_node.get(node), -1) for node in joint_nodes]

# Per-vertex influence lookup: joint slot -> weight.
influence = [{j: w for j, w in zip(js, ws) if w > 0} for js, ws in zip(joints, weights)]


def centroid(pred):
    sx = sy = sz = n = 0
    for v, inf in enumerate(influence):
        if pred(inf):
            x, y, z = positions[v]
            sx += x
            sy += y
            sz += z
            n += 1
    return (sx / n, sy / n, sz / n) if n else None


world = [None] * len(joint_nodes)
for i in range(len(joint_nodes)):
    p = parent[i]
    if p < 0:
        world[i] = centroid(lambda inf: inf.get(i, 0) > 0.35)
        continue
    for t in (0.2, 0.1, 0.03):
        c = centroid(lambda inf: inf.get(i, 0) > t and inf.get(p, 0) > t)
        if c:
            world[i] = c
            break
# Bones with no blend zone (finger tips, end bones) sit on their parent. Parents come before children in the
# joint list of a Mixamo skeleton, but loop until settled in case they don't.
for _ in range(len(joint_nodes)):
    for i in range(len(joint_nodes)):
        if world[i] is None and parent[i] >= 0 and world[parent[i]] is not None:
            world[i] = world[parent[i]]
world = [w or (0.0, 0.0, 0.0) for w in world]

# Rest pose: translations only.
for i, node in enumerate(joint_nodes):
    n = gl['nodes'][node]
    for k in ('rotation', 'scale', 'matrix'):
        n.pop(k, None)
    p = parent[i]
    local = world[i] if p < 0 else tuple(a - b for a, b in zip(world[i], world[p]))
    n['translation'] = [round(v, 6) for v in local]

# Inverse bind matrices (column-major): translate by -joint.
ibm = b''.join(struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1) for x, y, z in world)
ibm_acc = gl['accessors'][skin['inverseBindMatrices']]
ibm_acc.pop('min', None)
ibm_acc.pop('max', None)

# Texture: downsize every embedded image to tex_size.
new_views = {}
new_views[ibm_acc['bufferView']] = ibm
for im in gl.get('images', []):
    if 'bufferView' not in im:
        continue
    img = Image.open(io.BytesIO(view_bytes(im['bufferView']))).convert('RGB')
    if max(img.size) > tex_size:
        img = img.resize((tex_size, tex_size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, 'JPEG', quality=86, optimize=True)
    new_views[im['bufferView']] = out.getvalue()
    im['mimeType'] = 'image/jpeg'

# Repack the binary chunk with 4-byte alignment.
packed = bytearray()
for i, bv in enumerate(gl['bufferViews']):
    chunk = new_views.get(i, view_bytes(i))
    while len(packed) % 4:
        packed.append(0)
    bv['byteOffset'] = len(packed)
    bv['byteLength'] = len(chunk)
    packed += chunk
while len(packed) % 4:
    packed.append(0)
gl['buffers'][0]['byteLength'] = len(packed)
gl['asset']['generator'] = gl['asset'].get('generator', '') + ' + repair_glb.py'

js = json.dumps(gl, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(packed)
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON') + js)
    f.write(struct.pack('<I4s', len(packed), b'BIN\x00') + bytes(packed))

names = [gl['nodes'][n].get('name', '') for n in joint_nodes]
for want in ('mixamorig:Hips', 'mixamorig:Head', 'mixamorig:LeftArm', 'mixamorig:RightHand', 'mixamorig:LeftFoot'):
    if want in names:
        print(want, [round(v, 3) for v in world[names.index(want)]])
print(f'wrote {dst}: {total / 1024:.0f} KiB (was {len(data) / 1024:.0f} KiB)')
