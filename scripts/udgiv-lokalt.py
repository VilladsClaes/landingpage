#!/usr/bin/env python3
"""Upload den byggede landingsside (dist/) til public_html/ på Simply.com over FTPS.

Bruges når siden skal udgives fra denne computer i stedet for via GitHub Actions:

    npm run build
    python scripts/udgiv-lokalt.py            (spørger efter FTP-kodeordet)
    python scripts/udgiv-lokalt.py --check    (viser kun hvad der ligger i public_html)

Kodeordet læses fra miljøvariablen SIMPLY_FTP_PASS eller bliver spurgt om. Det
gemmes aldrig. Scriptet uploader ALLE filer i dist/ (også dem der ikke er ændret)
og sletter aldrig noget på serveren, så undermapper og App_Data/besog.txt er i
sikkerhed.

--ryd-bornetv fjerner den .htaccess (741 bytes), som BørneTV's deploy-script ved
en fejl lagde i public_html. Kun hvis størrelsen passer præcis.
"""

from __future__ import annotations

import argparse
import ftplib
import getpass
import os
import ssl
import sys
import time
import urllib.request
from pathlib import Path

HOST = "ftp.simply.com"
USER = "villadsclaes.dk"
FOLDER = "public_html"
SITE_URL = "https://villadsclaes.dk/"
DIST = Path(__file__).resolve().parent.parent / "dist"
BORNETV_HTACCESS_SIZE = 741


def connect(password: str) -> ftplib.FTP_TLS:
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context())
    ftp.connect(HOST, 21, timeout=60)
    ftp.login(USER, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    return ftp


def ensure_dir(ftp: ftplib.FTP, rel: str, made: set[str]) -> None:
    if not rel or rel in made:
        return
    parent = rel.rsplit("/", 1)[0] if "/" in rel else ""
    ensure_dir(ftp, parent, made)
    try:
        ftp.mkd(rel)
    except ftplib.error_perm:
        pass  # findes allerede
    made.add(rel)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="Vis kun indholdet af public_html, upload intet")
    parser.add_argument("--ryd-bornetv", action="store_true", help="Fjern BørneTV's fejlagtige .htaccess fra public_html")
    args = parser.parse_args()

    if not args.check and not (DIST / "index.html").is_file():
        raise SystemExit("dist/index.html mangler. Kør 'npm run build' først.")

    password = os.environ.get("SIMPLY_FTP_PASS") or getpass.getpass(f"FTP-kodeord til {USER} på {HOST}: ")
    print(f"Forbinder til {HOST} som {USER} (FTPS) …")
    try:
        ftp = connect(password)
    except ftplib.error_perm as error:
        print(f"FTP afviste login: {error}")
        return 2

    try:
        ftp.cwd(FOLDER)
        root = ftp.pwd()
        if root.rstrip("/").rsplit("/", 1)[-1] != FOLDER:
            raise SystemExit(f"STOP: står i {root}, ikke {FOLDER}/. Intet blev uploadet.")

        if args.check:
            print(f"{root}: " + ", ".join(sorted(ftp.nlst())))
            return 0

        files = sorted(p for p in DIST.rglob("*") if p.is_file())
        made: set[str] = set()
        started = time.time()
        for path in files:
            rel = path.relative_to(DIST).as_posix()
            ensure_dir(ftp, rel.rsplit("/", 1)[0] if "/" in rel else "", made)
            with path.open("rb") as handle:
                ftp.storbinary(f"STOR {rel}", handle)
            print(f"  {rel} ({path.stat().st_size:,} bytes)".replace(",", "."))

        bad = []
        for path in files:
            rel = path.relative_to(DIST).as_posix()
            try:
                size = ftp.size(rel)
            except ftplib.error_perm:
                size = None
            if size is None or int(size) != path.stat().st_size:
                bad.append(rel)
        if bad:
            print("Kunne ikke bekræfte: " + ", ".join(bad))
            return 1
        print(f"Alle {len(files)} filer ligger i {root} (bekræftet på størrelse) på {time.time() - started:.0f} s.")

        if args.ryd_bornetv:
            try:
                size = ftp.size(".htaccess")
            except ftplib.error_perm:
                size = None
            if size is not None and int(size) == BORNETV_HTACCESS_SIZE:
                ftp.delete(".htaccess")
                print("Fjernede BørneTV's .htaccess fra public_html.")
            else:
                print(f".htaccess blev ikke rørt (størrelse {size}).")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()

    req = urllib.request.Request(SITE_URL, headers={"User-Agent": "Mozilla/5.0 (udgiv-lokalt)", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            body = res.read(20000).decode("utf-8", "replace")
        print("Tjek: forsiden viser landingssiden." if "sites og projekter" in body else "Tjek: forsiden svarer, men ligner ikke landingssiden endnu.")
    except Exception as error:  # noqa: BLE001
        print(f"Kunne ikke hente {SITE_URL}: {error}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
