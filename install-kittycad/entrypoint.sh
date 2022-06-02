# Export the sha256sum for verification.
export KITTYCAD_CLI_SHA256="a3d8e6471745abbf134f58c0c666a3d114d9646d56e60231a20a233a44536f7f"


# Download and check the sha256sum.
curl -fSL "https://dl.kittycad.io/releases/cli/v0.0.9/cli-freebsd-amd64" -o "/usr/local/bin/kittycad" \
	&& echo "${KITTYCAD_CLI_SHA256}  /usr/local/bin/kittycad" | sha256sum -c - \
	&& chmod a+x "/usr/local/bin/kittycad"

echo "kittycad cli installed!"

# Run it!
# kittycad -h || true
