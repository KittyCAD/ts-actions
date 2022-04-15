<p align="center">
  <a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p>

# Add issues to the "All Tasks" project

This action will automatically add issues to our "All Tasks" project

It uses typescript, but since actions need to be javascript the build files are committed as well in dist and lib. We're using Vercel's `ncc` to bundle dependancies along with the build code.

Because this interacts with the Github api, and our Github resources, the development story is little rough. Talk to @Ire-dev for tips

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

You will need to make a release to reference the action in other repo workflows.

