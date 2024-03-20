#!/bin/sh

echo "[Building Models]"
npm run build
echo "Done."

echo "[Installing Models]"
mkdir -p ./node_modules/@grnsft/if-optimisation-plugins
rm -rf ./node_modules/@grnsft/if-optimisation-plugins/build
cp -r build ./node_modules/@grnsft/if-optimisation-plugins
cp package.dummy.json ./node_modules/@grnsft/if-optimisation-plugins/package.json
echo "Done."