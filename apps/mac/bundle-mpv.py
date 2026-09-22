#!/usr/bin/env python3
"""Copy the libmpv dependency closure, so the installed app never loads IINA."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

app = Path(sys.argv[1])
source = Path(os.environ.get('MPV_LIBRARY_DIR', '/Applications/IINA.app/Contents/Frameworks'))
target = app / 'Contents/Frameworks'
target.mkdir(parents=True, exist_ok=True)
executable = app / 'Contents/MacOS/BetterWatch'
arch = subprocess.check_output(['uname', '-m'], text=True).strip()

def dependencies(path):
    output = subprocess.check_output(['otool', '-arch', arch, '-L', str(path)], text=True)
    return [line.strip().split(' (')[0] for line in output.splitlines()[1:]]

pending = [source / 'libmpv.2.dylib']
copied = set()
while pending:
    original = pending.pop()
    if original.name in copied:
        continue
    copied.add(original.name)
    destination = target / original.name
    architectures = subprocess.check_output(['lipo', '-archs', str(original)], text=True).split()
    if len(architectures) > 1:
        subprocess.run(['lipo', str(original), '-thin', arch, '-output', str(destination)], check=True)
    else:
        shutil.copy2(original, destination)
    destination.chmod(0o755)
    subprocess.run(['install_name_tool', '-id', '@rpath/' + original.name, str(destination)], check=True)
    for dep in dependencies(original):
        if dep.startswith(('/System/', '/usr/lib/')):
            continue
        dependency = source / Path(dep).name if dep.startswith(('@rpath/', '@loader_path/')) else Path(dep)
        if dependency.name == original.name:
            continue
        pending.append(dependency)
        subprocess.run(['install_name_tool', '-change', dep, '@rpath/' + dependency.name, str(destination)], check=True)
    subprocess.run(['codesign', '--force', '--sign', '-', str(destination)], check=True, capture_output=True)

subprocess.run(['install_name_tool', '-delete_rpath', str(source), str(executable)], check=True)
subprocess.run(['install_name_tool', '-add_rpath', '@executable_path/../Frameworks', str(executable)], check=True)
print(f'Bundled {len(copied)} playback libraries ({arch})')
