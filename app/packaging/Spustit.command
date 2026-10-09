#!/bin/sh
# Totéž co spustit.sh, jen s příponou, na kterou reaguje dvojklik ve Finderu.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

# macOS označí všechno stažené z internetu karanténou a odmítne to spustit,
# protože přibalený Node není podepsaný Apple ID. Tohle je přesně ten krok,
# který by jinak uživatel musel opsat z návodu do terminálu.
if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$DIR" 2>/dev/null || true
fi

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
