# Frontend

React + TypeScript with Vite, using the official `react-ts` starter.

## Development

Use Node.js 24 and npm. Run these commands from this directory:

```powershell
npm ci
npm run dev
```

Vite prints the local development URL after starting.

## Scripts

- `npm run dev`: start the development server with hot module replacement.
- `npm run lint`: check source files with Oxlint.
- `npm test`: check input validation and next-stage selection using Node's test runner.
- `npm run build`: check TypeScript and produce a production build in `dist/`.
- `npm run preview`: serve the production build locally for review.

## Entry points

- `index.html`: browser entry document.
- `src/main.tsx`: React application entry point.
- `src/App.tsx`: application composition.
- `src/layouts/AppLayout.tsx`: workflow sidebar and shared page shell.
- `src/features/ingestion/`: Describe or Upload page, form behavior, and validation.
- `src/index.css`: global styles.

## Describe or Upload

Accepts a description, a PNG/JPG/PDF diagram, or both. Descriptions are limited to
4,000 characters and diagrams to 10 MB. Files stay local; image thumbnails and
file preview links use temporary object URLs, which are released on replacement,
removal, or unmounting.

Text-only drafts proceed to planning; drafts with a diagram proceed to parsing.
Continue currently displays this intent without calling an API. Muse integration
and later screens will be implemented in separate changes. Nothing is persisted
across a page reload. Client validation is a usability check; the future backend
must validate file content, size, and request data independently.
