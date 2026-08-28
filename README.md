# PV Thermal Automated Photogrammetry MVP

Acest pachet automatizează ce am testat manual în MicMac:

**JPEG → EXIF/XMP → segmentare GPS/timp/yaw → calibrare stabilă → Tapioca → Tapas → split automat la eșec → Malt/Tawny per bloc.**

## Instalare în proiect

Copiază folderele `photogrammetry` și `ui` în:

`C:\Users\vanza\Projects\pv-thermal-ai`

Sunt presupuse deja instalate:
- WSL2 + Ubuntu
- MicMac la `/home/vanza/micmac/bin/mm3d`
- ImageMagick, exiv2 și exiftool în Ubuntu
- ExifTool Windows la `C:\Tools\ToolsExifTool\exiftool.exe`
- Streamlit în `.venv`

## Test CLI pe cele 141 imagini

```powershell
cd C:\Users\vanza\Projects\pv-thermal-ai
.\.venv\Scripts\Activate.ps1
python -m photogrammetry.cli --input "C:\Users\vanza\Projects\pv-thermal-ai\real_data\organized\thermal" --job-name IR_141_AUTO
```

Rezultatele apar în:

`real_data\jobs\IR_141_AUTO`

## UI upload

```powershell
streamlit run ui\orthomosaic_app.py
```

Apoi selectezi JPEG-urile și apeși **PROCESS FLIGHT**.

## Ce este deja automat

- citire metadata DJI prin ExifTool;
- detectare GPS și model cameră;
- completare automată a camerei în MicMac dacă lipsește;
- găsirea unui subset stabil de 8 imagini pentru calibrare;
- segmentarea zborului după timp/GPS/yaw;
- blocuri maxime de 24 imagini;
- dacă `Tapas` dă `MST1 Incoh`, distortion failure sau alt eșec, blocul se împarte automat și se reîncearcă;
- orientarea folosește calibrarea stabilă fixată;
- încearcă `Malt Ortho` + `Tawny` pe fiecare bloc reușit.

## Limitarea actuală

MVP-ul **nu declară încă un ortofotoplan final unic** dacă blocurile nu sunt georeferențiate într-un CRS comun. Următorul pas este:

1. introducerea GPS/orientărilor DJI ca prior geometric în MicMac;
2. GeoTIFF georeferențiat per bloc;
3. merge automat cu GDAL într-un singur ortofotoplan;
4. preview web + download.

Asta este intenționat: mai bine un rezultat parțial corect decât un mosaic „amestecat” ca în NodeODM.
