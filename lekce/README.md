# Lekce pro další děti

Každé dítě má vlastní Vercel projekt (vlastní adresu) ze stejného repozitáře.

- `chrisschool-….vercel.app` → Chrisovy lekce (blok `LESSONS` v `index.html`).
- `<nazev>.vercel.app` → lekce ze souboru `lekce/<nazev>.json`.

Soubor je JSON pole lekcí ve stejném formátu jako v `index.html`
(`id, subject, title, source, added, intro, sections, watch, quiz`).
Když soubor chybí, dítě má Výuku zatím prázdnou.
