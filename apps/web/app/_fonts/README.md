# Fonts

`bricolage-grotesque-display.woff2` is Bricolage Grotesque, Copyright 2022 The Bricolage Grotesque
Project Authors (https://github.com/ateliertriay/bricolage), licensed under the SIL Open Font
License 1.1 (https://openfontlicense.org). The copyright and licence URL are also in the font's
name table.

It is the Google Fonts Latin subset, instanced with fontTools to the one style the site uses:
weight 800 and optical size 96 fixed, width still variable from 75 to 100. That takes it from
131 KB to 40 KB (DESIGN_SPEC §2.4).

```bash
fonttools varLib.instancer <latin-subset>.woff2 wght=800 opsz=96 wdth=75:100 -o display.ttf
```

Then save it with the `woff2` flavor. The other two families (Public Sans, IBM Plex Mono) come
from `next/font/google`.
