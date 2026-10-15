#!/bin/sh
# Give every stylesheet and script link in index.html a fresh ?v= tag, so
# browsers (iPhone Safari especially) fetch the new files after a change
# instead of reusing old cached copies. Run before committing a change.
cd "$(dirname "$0")"
v=$(date -u +%Y%m%d-%H%M%S)
sed -i.bak -E \
  -e "s#(href=\"css/[^\"?]+\.css)(\?v=[^\"]*)?\"#\1?v=$v\"#g" \
  -e "s#(src=\"js/[^\"?]+\.js)(\?v=[^\"]*)?\"#\1?v=$v\"#g" \
  index.html && rm -f index.html.bak
echo "assets tagged v=$v"
