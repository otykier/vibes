# BrickUp

Collaborative LEGO set inventory checklist. Enter a LEGO set number, get a checklist of every piece, and check off bricks together in real-time.

**Live at [brickup.dk](https://brickup.dk)**

## Features

- **Real-time sync** — multiple people can check off pieces simultaneously
- **QR sharing** — share via link or QR code, no accounts needed
- **Sort & filter** — organize by color, category, or completion status
- **Drag-to-reorder** — rearrange groups with drag and drop (touch supported)
- **Recent sessions** — quickly re-open previous sessions from the home page

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)
- [Supabase](https://supabase.com/) (Postgres, Realtime, RPC, Edge Functions)
- [Rebrickable API](https://rebrickable.com/api/) for LEGO set and part data

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

Builds and publishes to GitHub Pages via the [pages-brickup](https://github.com/otykier/pages-brickup) repo.

## License

[MIT](../LICENSE)
