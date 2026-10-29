#!/usr/bin/env python3
"""
Gera catalogo.json a partir dos PDFs nas pastas dentro de pdfs/.

Uso:
  python gerar-catalogo.py

Estrutura esperada:
  pdfs/
    algoritmos/
    sistemas-operacionais/
    desenvolvimento-de-jogos/
    intro-jogos-mobile/
    programacao-mobile/
    geral/
"""

from pathlib import Path
import json
from datetime import datetime

ROOT = Path(__file__).resolve().parent
PDFS = ROOT / "pdfs"
OUT = ROOT / "catalogo.json"

# Pastas conhecidas (ordem de exibição)
PASTAS = [
    "algoritmos",
    "sistemas-operacionais",
    "desenvolvimento-de-jogos",
    "intro-jogos-mobile",
    "programacao-mobile",
    "geral",
]

LABELS = {
    "algoritmos": "Algoritmos e Estruturas de Dados",
    "sistemas-operacionais": "Sistemas Operacionais",
    "desenvolvimento-de-jogos": "Desenvolvimento de Jogos",
    "intro-jogos-mobile": "Introdução Jogos e Mobile",
    "programacao-mobile": "Programação Mobile",
    "geral": "Geral",
}

def titulo_from_filename(name: str) -> str:
    # Remove extensão e troca _ e - por espaço
    stem = Path(name).stem
    stem = stem.replace("_", " ").replace("-", " ")
    # Capitaliza palavras
    return " ".join(w.capitalize() if w.islower() else w for w in stem.split())

def scan():
    catalog = []
    PDFS.mkdir(exist_ok=True)

    # Garante pastas
    for p in PASTAS:
        (PDFS / p).mkdir(exist_ok=True)

    for pasta in PASTAS:
        pasta_path = PDFS / pasta
        # Lista PDFs (e também .PDF)
        files = sorted(
            [f for f in pasta_path.iterdir() if f.is_file() and f.suffix.lower() == ".pdf"],
            key=lambda f: f.name.lower()
        )
        for f in files:
            rel = f.relative_to(ROOT).as_posix()
            mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d")
            catalog.append({
                "titulo": titulo_from_filename(f.name),
                "arquivo": rel,
                "pasta": pasta,
                "nomeArquivo": f.name,
                "data": mtime,
            })

        # Subpastas opcionais dentro de cada disciplina
        for sub in sorted([d for d in pasta_path.iterdir() if d.is_dir()], key=lambda d: d.name.lower()):
            sub_files = sorted(
                [f for f in sub.iterdir() if f.is_file() and f.suffix.lower() == ".pdf"],
                key=lambda f: f.name.lower()
            )
            for f in sub_files:
                rel = f.relative_to(ROOT).as_posix()
                mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d")
                catalog.append({
                    "titulo": titulo_from_filename(f.name),
                    "arquivo": rel,
                    "pasta": pasta,
                    "subpasta": sub.name,
                    "nomeArquivo": f.name,
                    "data": mtime,
                })

    return catalog

def main():
    catalog = scan()
    data = {
        "geradoEm": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "pastas": PASTAS,
        "labels": LABELS,
        "arquivos": catalog,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ Catálogo gerado: {OUT.name}")
    print(f"  {len(catalog)} arquivo(s) encontrado(s)")
    by_pasta = {}
    for a in catalog:
        by_pasta.setdefault(a["pasta"], 0)
        by_pasta[a["pasta"]] += 1
    for p in PASTAS:
        n = by_pasta.get(p, 0)
        print(f"  - {p}/ : {n}")
    if not catalog:
        print("\n  (Nenhum PDF ainda. Coloque arquivos nas pastas e rode de novo.)")

if __name__ == "__main__":
    main()
