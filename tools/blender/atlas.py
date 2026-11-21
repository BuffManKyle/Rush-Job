"""Re-bake a Meshy texture atlas with gutters (owner: rj-street; used by civs_build.py).

Meshy packs its UV islands edge to edge: each island's colour is dilated only up to the midpoint to
its neighbour, often 0-2 px at 2048. Downsized to 512-1024 px, JPEG-compressed and mipmapped in
three.js, the neighbour's colour bleeds over every seam (white lines on a black suit).

rebake(mesh, size, gutter_px) repacks the same islands with `gutter_px` of empty space between them
at the final size, bakes the old texture onto the new layout (Cycles emit bake, no lighting), and
fills the gutters by extending each island's edge colour, so every island owns gutter_px / 2 px
of its own colour on every side. That survives the mips down to about 2^log2(gutter_px) px blocks.
"""
import bpy


def _images(mesh):
    out = []
    for m in mesh.data.materials:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and n.image not in out:
                out.append(n.image)
    return out


def rebake(mesh, size=512, gutter_px=8, samples=16):
    srcs = _images(mesh)
    if len(srcs) != 1:
        raise SystemExit(f"rebake {mesh.name}: expected one texture, found {len(srcs)}")
    src = srcs[0]
    me = mesh.data
    old = me.uv_layers.active
    old_name = old.name
    new = me.uv_layers.new(name="rj_rebake")
    me.uv_layers.active = new

    # repack the existing islands into the new layer with a fixed gutter at the final size
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, rotate_method='ANY', scale=True, merge_overlap=False,
                            margin_method='FRACTION', margin=gutter_px / size, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')

    dst = bpy.data.images.new(f"{src.name}_rb", size, size, alpha=False)
    dst.colorspace_settings.name = src.colorspace_settings.name

    # every material: source texture read through the OLD uv -> emission; target node active
    saved = []
    for m in me.materials:
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
        tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image == src)
        surf = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = old_name
        old_vec = tex.inputs['Vector'].links[0].from_socket if tex.inputs['Vector'].links else None
        nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
        interp, tex.interpolation = tex.interpolation, 'Closest'   # never blend across an old island edge
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        tgt = nt.nodes.new('ShaderNodeTexImage'); tgt.image = dst
        nt.nodes.active = tgt
        saved.append((nt, out, tex, surf, uvn, old_vec, em, tgt, interp))

    sc = bpy.context.scene
    prev_engine = sc.render.engine
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.bake.margin = max(64, gutter_px * 4)       # extend fills every gutter completely
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    bpy.ops.object.bake(type='EMIT')
    sc.render.engine = prev_engine
    dst.pack()

    # restore the materials, now pointing at the re-baked image on the new layout
    for nt, out, tex, surf, uvn, old_vec, em, tgt, interp in saved:
        nt.nodes.remove(uvn); nt.nodes.remove(em); nt.nodes.remove(tgt)
        if old_vec:
            nt.links.new(old_vec, tex.inputs['Vector'])
        if surf:
            nt.links.new(surf, out.inputs['Surface'])
        tex.image = dst
        tex.interpolation = interp
    me.uv_layers.remove(me.uv_layers[old_name])
    new = me.uv_layers["rj_rebake"]
    new.name = old_name
    me.uv_layers.active = new
    new.active_render = True
    if src.users == 0:
        bpy.data.images.remove(src)
    return dst
