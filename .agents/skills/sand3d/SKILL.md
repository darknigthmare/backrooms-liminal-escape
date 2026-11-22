---
name: sand3d
description: Create deterministic procedural 3D objects, articulated assemblies, and exportable meshes with Sandflow's Sand3D Python API and Blender bpy. Use only for relevant 3D/CAD/asset-generation tasks.
---

# Sand3D — procedural 3D as code

Use this skill when the task requires **programmable 3D geometry**, reproducible game props, mechanical assemblies, named parts or joints, or exporting 3D assets. This complements existing game/3D skills (including 3dviz-pro-max), CodeGraph, Spec Kit and Superpowers; it does **not** replace project art pipelines or alter existing models automatically.

## Provenance and API references

- Upstream: https://github.com/Sandflow-ai/sand3d
- Stable release used by this guide: **v1.6.3** (2026-11-06), Apache-2.0.
- Read the upstream API reference **before writing complex programs**: https://github.com/Sandflow-ai/sand3d/blob/v1.6.3/docs/api.md
- Read the examples and assembly guidelines: https://github.com/Sandflow-ai/sand3d/tree/v1.6.3/docs
- This file is an integration guide, **not** a copy of the Sand3D library or an assertion that Sand3D is installed.

## Activation: optional, isolated environment

Only set up Sand3D when a task needs it and the environment permits package installation. Prefer Python 3.13 (or 3.11); **Python 3.12 is unsupported by Blender bpy wheels**. Sand3D installs bpy as a dependency.

```bash
python3.13 -m venv .venv-sand3d
. .venv-sand3d/bin/activate
python -m pip install 'sand3d==1.6.3'
python -c 'import sand3d as s3d; print("Sand3D available")'
```

If Python 3.13 is unavailable, use a compatible Python 3.11 executable. Do not run these commands merely because this skill is present. Do not add sand3d/bpy to application production dependencies or CI unless the project explicitly needs them.

## Production workflow

1. Read project-specific AGENTS.md/CLAUDE.md, existing skills, engine requirements, units, style and asset naming first.
2. Define the shape as readable named components using `s3d.rect`, `extrude`, `box`, `cut`, `fillet`, `group`, etc., following the pinned API signatures.
3. For moving parts use named frames, `s3d.joint`, and `s3d.assembly`; keep parts and motion limits explicit. Do not guess API signatures; consult the upstream API.
4. Build only the required objects; export using `s3d.export(object, "asset.glb")` (also URDF, USDA, OBJ or STL when appropriate). Sand3D's authoring units are **millimetres by default** while exported dimensions are in metres.
5. Validate import, generated geometry, part orientation, materials, joint motion and actual rendering with suitable 3D tools. For 2D games, render sprites from approved 3D sources only when the project pipeline calls for this.
6. Keep generated heavy assets and temporary caches in the existing asset pipeline; don't commit them without task approval or invent successful renders.

### Minimal example

```python
import sand3d as s3d

def bracket():
    plate = s3d.extrude("plate", s3d.rect(80, 40, r=4), 6)
    s3d.fillet(plate, 1, edges="top")
    return plate

s3d.export(bracket(), "bracket.glb")
```

When Sand3D isn't installed or a matching asset pipeline isn't available, provide the program and exact setup instructions; never claim it ran. No online API, credential, model download, or GPU is required for the integration guide itself.
