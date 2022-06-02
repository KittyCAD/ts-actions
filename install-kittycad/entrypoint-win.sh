# Export the sha256sum for verification.
export KITTYCAD_CLI_SHA256="ee4a911b6814262b4e4d83c877654715a6442d401dbd2a104ebf31e82101e024"


# Download and check the sha256sum.
curl -fSL "https://dl.kittycad.io/releases/cli/v0.0.9/cli-windows-amd64" -o "/usr/local/bin/kittycad" \
	&& echo "${KITTYCAD_CLI_SHA256}  /usr/local/bin/kittycad" | sha256sum -c - \
	&& chmod a+x "/usr/local/bin/kittycad"


echo "kittycad cli installed!"

# Run it!
kittycad -h
