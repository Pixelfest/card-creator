# PROTOTYPE: Editor and Collection UI

Throwaway code answering one question for the wayfinder ticket "Editor and Collection UI"
(Pixelfest/card-creator#11): **what should the Set editor look like?**

Three structurally different editor variants share one in-memory model, a stand-in renderer and
undo/redo. The home and Collection pages each have one plain version so the flow can be clicked through.
Nothing is saved. Assets (frames, fonts, snippet backgrounds) are drawn procedurally as placeholders.

Run:

```bash
npm --prefix prototype/ui-editor install
npm --prefix prototype/ui-editor run dev
```

Pages: `?page=home`, `?page=collection`, `?page=editor&variant=A|B|C`. Flip variants with the floating
bar or the left/right arrow keys.
