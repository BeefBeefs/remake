"""Episode-aware paths for the build tools. EP=2 python3 tools/build_scripts.py ... converts the Episode 2 patch (public/assets/ep2) into public/data/ep2.
Each episode only holds what is new or changed; at run time src/data.ts falls back to lower episodes for everything else (manifest.json lists what an episode holds)."""
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
EP = int(os.environ.get('EP', '1'))
def assets(ep=None): return os.path.join(ROOT, 'assets', 'ep%d' % (ep or EP))
def data(ep=None): return os.path.join(ROOT, 'data', 'ep%d' % (ep or EP))
def lower_data(rel):
    """Path of `rel` in the data folder of this or a lower episode, or None."""
    for e in range(EP, 0, -1):
        p = os.path.join(data(e), rel)
        if os.path.exists(p): return p
    return None
def raw_dir(rel):
    """Path of a raw asset folder/file in this or a lower episode, or None."""
    for e in range(EP, 0, -1):
        p = os.path.join(assets(e), rel)
        if os.path.exists(p): return p
    return None
