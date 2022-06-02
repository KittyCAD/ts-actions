# Export the sha256sum for verification.
export KITTYCAD_CLI_SHA256="101a7e812d9e8c19ac034b0f57a7b8ee85543e22db78552b64987631ce7ad470"


# Download and check the sha256sum.
curl -fSL "https://dl.kittycad.io/releases/cli/v0.0.9/cli-linux-arm64" -o "/usr/local/bin/kittycad" \
	&& echo "${KITTYCAD_CLI_SHA256}  /usr/local/bin/kittycad" | sha256sum -c - \
	&& chmod a+x "/usr/local/bin/kittycad"


echo "kittycad cli installed!"

# Run it!
kittycad -h
