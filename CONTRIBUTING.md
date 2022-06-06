## Typescript Actions

`add-issues-to-project`, `get-deployment-target-url` and `show-visual-diffs-in-comment` an all typescript actions we use internally in other repos

Since actions need to be javascript the build files are committed as well in `dist` and `lib`. We're using Vercel's `ncc` to bundle dependancies along with the build code.

Because this interacts with the Github api, and our Github resources, the development story is little rough. Talk to Kurt for tips

This repo is public as is a requirement for Actions.

## Dev

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

before you push make sure you also commit the generated changes in `dist` and `lib`

You will need to make a tag and release to reference the action in other repo workflows.