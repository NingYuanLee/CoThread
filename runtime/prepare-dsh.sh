#!/bin/sh
set -eu
# All downloads are pinned and come from official Node.js / npm distribution endpoints.
RUNTIME=/home/user/.local/cothread-runtime
NODE_VERSION=v24.18.0
NODE_ARCHIVE=node-${NODE_VERSION}-linux-x64.tar.xz
mkdir -p "$RUNTIME"
if [ ! -x "$RUNTIME/node/bin/node" ]; then
  cd "$RUNTIME"
  curl --fail --location --silent --show-error --max-time 90 "https://nodejs.org/dist/$NODE_VERSION/$NODE_ARCHIVE" -o "$NODE_ARCHIVE"
  curl --fail --location --silent --show-error --max-time 30 "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o SHASUMS256.txt
  grep " $NODE_ARCHIVE\$" SHASUMS256.txt | sha256sum -c -
  mkdir -p node
  # ACS's virtual filesystem rejects GNU tar's delayed directory timestamp restoration.
  # Extract verified bytes without rewriting directory metadata.
  python3 - "$RUNTIME/$NODE_ARCHIVE" "$RUNTIME/node" <<'PY'
import os, pathlib, shutil, sys, tarfile
root = pathlib.Path(sys.argv[2]).resolve()
with tarfile.open(sys.argv[1], 'r:xz') as archive:
    for member in archive:
        parts = pathlib.PurePosixPath(member.name).parts[1:]
        if not parts:
            continue
        target = root.joinpath(*parts)
        if not target.resolve().is_relative_to(root):
            raise ValueError('Unsafe archive path')
        target.parent.mkdir(parents=True, exist_ok=True)
        if member.isdir():
            target.mkdir(exist_ok=True)
        elif member.issym():
            if not (target.parent / member.linkname).resolve().is_relative_to(root):
                raise ValueError('Unsafe archive link')
            target.symlink_to(member.linkname)
        elif member.isfile():
            with archive.extractfile(member) as source, target.open('wb') as output:
                shutil.copyfileobj(source, output)
            target.chmod(member.mode & 0o777)
        else:
            raise ValueError('Unsupported archive entry')
PY
fi
export PATH="$RUNTIME/node/bin:$PATH"
if [ ! -x "$RUNTIME/dsh/node_modules/.bin/dsh" ]; then
  npm install --prefix "$RUNTIME/dsh" --registry=https://registry.npmjs.org --no-audit --no-fund @deepseek-ai/dsh@0.1.2-rc.1
fi
"$RUNTIME/node/bin/node" --version
