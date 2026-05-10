# Contributing

## Setup

Requires Node.js. Install dependencies with:

```sh
npm ci
```

## Making changes

All source lives in `src/`. Edit `src/cropt.ts` for library logic,
`src/cropt.css` for styles, or `src/demo.ts` for the demo app.

> [!NOTE]  
> `*.js` and `*.d.ts` files are auto-generated; do not edit them directly.

## Build

Compile TypeScript and demo files, and copy assets to `demo/build/`:

```sh
npm run prepare
```

## Preview

Serve the demo locally at `http://localhost:8080`:

```sh
npm start
```

## Format

```sh
npm run format
```
