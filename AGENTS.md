<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project architecture

- Keep replay-analysis UI, typed event data, and tests together under `src/features/analysis`; this isolates the core review workflow for testing and rollback.
- Keep analysis resizing in nested vertical/horizontal panels inside a fixed-height, page-scrollable workspace; this lets the video retain its aspect ratio while the table and notes remain independently resizable.
