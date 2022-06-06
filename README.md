## Actions

This repo contains a collections of actions, some are our internal actions, others are useful actions that leverage the KittyCAD cli.

### Install KittyCAD CLI

If you want to use the KittyCAD cli directly in your actions, for example:
```yml
name: "install KittyCAD cli"
on:
  pull_request:
jobs:
  my-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: KittyCAD/ts-actions/install-kittycad@v0.2.2
      - name: use KittyCAD cli
        run: kittycad --version # do things with cli
        env: 
          KITTYCAD_API_TOKEN: ${{ secrets.KITTYCAD_API_TOKEN }}
```

### convert all files in a directory

This action will convert all 3D files in a directory to your desired format.

```yml
name: "test converting files"
on:
    pull_request:
jobs:
  test-convert-directory-action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: KittyCAD/ts-actions/convert-dir@v0.2.2
        with:
          kittycad-token: ${{ secrets.KITTYCAD_API_TOKEN }}
          input-directory: original-files-path
          output-directory: converted-files-path
          conversion-type: fbx
      - name: Check files converted
        run: ls converted-files-path # prints converted file names
```

## Other actions

For our other internal use actions see CONTRIBUTING.md

