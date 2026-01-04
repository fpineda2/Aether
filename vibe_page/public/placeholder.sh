# create_placeholder.sh
# Run: bash create_placeholder.sh
mkdir -p public
# create 1x1 transparent png from base64
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQH7UY8AAAAASUVORK5CYII=' | base64 -d > public/placeholder.png
echo "public/placeholder.png created"