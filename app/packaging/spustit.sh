#!/bin/sh
# Spustí Stocks Analyzer. Prohlížeč se otevře sám, jakmile server naběhne.
cd "$(dirname "$0")" || exit 1
# Balík pro jinou platformu: Windows má runtime/node.exe, jiný systém nebo
# procesor má node, který tady nejde spustit. Bez této kontroly skončí
# nesrozumitelnou chybou shellu.
if [ ! -f ./runtime/node ] || ! ./runtime/node -v >/dev/null 2>&1; then
  echo
  echo "Tenhle balík není pro tenhle počítač."
  echo "macOS s Apple Silicon: soubor končící  -mac-arm64.zip"
  echo "Linux: soubor končící  -linux-x64.zip  (ARM: -linux-arm64.zip)"
  echo "Pro jakou platformu je tento balík, je napsané v souboru verze.json (\"target\")."
  exit 1
fi

exec ./runtime/node ./tools/start.mjs
