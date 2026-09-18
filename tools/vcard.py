#!/usr/bin/env python3
"""Génère les cartes de contact (vCard) et leurs QR codes pour mehmettuzcu.fr.

  python3 tools/vcard.py            # sans téléphone
  PHONE=+33600000000 python3 tools/vcard.py

Sorties : /mehmet-tuzcu.vcf, /tr/mehmet-tuzcu.vcf, /en/mehmet-tuzcu.vcf
          /assets/vcard-qr-{fr,tr,en}.svg
Le QR contient la fiche elle-même (lisible hors ligne par l'appareil photo
iOS / Android) ; le fichier .vcf ajoute la photo et une note.
Dépendance : segno (pip install segno), Pillow.
"""
import base64, io, os, pathlib
import segno
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PHONE = os.environ.get("PHONE", "").strip()
EMAIL = "conseil@mehmettuzcu.fr"
LINKEDIN = "https://www.linkedin.com/in/mehmet-tuzcu-110b4897/"

LANGS = {
    "fr": {"dir": "", "url": "https://mehmettuzcu.fr/",
           "title": "Architecte opérationnel & dirigeant qui code",
           "note": "Conseil en transformation, conformité et IA — mehmettuzcu.fr"},
    "tr": {"dir": "tr", "url": "https://mehmettuzcu.fr/tr/",
           "title": "Operasyonel mimar & kod yazan yönetici",
           "note": "Dönüşüm, mevzuat uyumu ve yapay zekâ danışmanlığı — mehmettuzcu.fr"},
    "en": {"dir": "en", "url": "https://mehmettuzcu.fr/en/",
           "title": "Operational architect & a founder who codes",
           "note": "Transformation, compliance and AI consulting — mehmettuzcu.fr"},
}


def esc(v):
    return v.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\;").replace("\n", "\\n")


def fold(line):
    """Plie à 75 octets (RFC 2425) sans couper un caractère UTF-8."""
    out, cur, n = [], "", 0
    for ch in line:
        b = len(ch.encode("utf-8"))
        if n + b > 75:
            out.append(cur)
            cur, n = " ", 1
        cur += ch
        n += b
    out.append(cur)
    return "\r\n".join(out)


def core(L):
    lines = ["BEGIN:VCARD", "VERSION:3.0", "N:TUZCU;Mehmet;;;", "FN:Mehmet TUZCU",
             f"TITLE:{esc(L['title'])}"]
    if PHONE:
        lines.append(f"TEL;TYPE=CELL,VOICE:{PHONE}")
    lines += [f"EMAIL;TYPE=INTERNET,WORK:{EMAIL}", f"URL:{L['url']}"]
    return lines


def photo_b64():
    im = Image.open(ROOT / "assets/profil.jpg").convert("RGB")
    im = im.crop((186, 110, 826, 750)).resize((320, 320), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


PHOTO = photo_b64()
for code, L in LANGS.items():
    # QR : fiche minimale, sans photo, pour rester lisible
    qr_txt = "\r\n".join(core(L) + ["END:VCARD"])
    qr = segno.make(qr_txt.encode("utf-8"), error="m", micro=False)
    qr.save(ROOT / f"assets/vcard-qr-{code}.svg", scale=4, border=2,
            dark="#163f54", light="#ffffff", xmldecl=False, svgns=True, omitsize=True,
            title=f"vCard Mehmet TUZCU ({code})")
    # Fichier .vcf complet
    full = core(L) + [
        f"URL;TYPE=LinkedIn:{LINKEDIN}",
        "X-SOCIALPROFILE;TYPE=linkedin:" + LINKEDIN,
        "ADR;TYPE=WORK:;;;;Alsace;;France",
        f"NOTE:{esc(L['note'])}",
        f"PHOTO;ENCODING=b;TYPE=JPEG:{PHOTO}",
        "END:VCARD",
    ]
    vcf = "\r\n".join(fold(l) for l in full) + "\r\n"
    target = ROOT / L["dir"] / "mehmet-tuzcu.vcf"
    target.write_bytes(vcf.encode("utf-8"))
    print(f"{code}: QR v{qr.version} ({qr.symbol_size()[0]} px) · vcf {len(vcf.encode()) // 1024} Ko -> {target.relative_to(ROOT)}")
