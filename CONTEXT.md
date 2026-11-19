# Card Creator

A public web app where anyone can design custom cards for a board game and export them for printing.

## Language

**Collection**:
A container of Sets reachable by one unique, unguessable Collection URL. Only an allowlisted IP address can create a Collection; anyone holding its URL can create and edit Sets inside it.
_Avoid_: workspace, account

**Collection URL**:
The unguessable address of a Collection; the only "key" to it and everything in it. No accounts, no personal information.
_Avoid_: login, Set URL (a Set is addressed within its Collection)

**Set**:
A named group of Cards inside a Collection, sharing one Card format.
_Avoid_: deck, project

**Card format**:
The ratio and physical size shared by every Card in a Set. Locked once the Set has its first Card. Currently only 44×72 mm exists.
_Avoid_: card size, template

**Card**:
One design within a Set, with a name, a Copies count, one Artwork, one Frame and up to three Text snippets.

**Copies**:
How many printed instances of a Card the export produces.
_Avoid_: amount, quantity

**Artwork**:
The image a user uploads as the main visual of a Card; it sits behind the Frame. Initially covers the Card, then the user may pan and zoom it freely; any uncovered area shows the Card's fill colour.
_Avoid_: background, picture

**Frame**:
A decorative PNG chosen from a repository-supplied library, transparent where the Artwork shows through.
_Avoid_: border (reserved sense: see Cut line)

**Text snippet**:
A piece of styled text placed in one Snippet slot of a Card (font, fill colour, outline colour, size, alignment, optional Snippet background). Emoji are allowed. The user can adjust its vertical position and zoom.

**Snippet slot**:
Where a Text snippet sits on a Card: `header` (in the top of the Frame), `banner` (just below the Frame's top), or `textbox` (bottom of the Card).

**Snippet background**:
An image chosen from a repository-supplied library, drawn behind a Text snippet; its proportions determine the snippet's height.

**Cut line**:
The thin black outline drawn around each Card in the Word export, to guide cutting after printing.
_Avoid_: border

## Relationships

- A **Collection** has many **Sets**
- A **Set** has one **Card format** and many **Cards**
- A **Card** has one **Artwork**, one **Frame**, and zero or more **Text snippets**
- A **Text snippet** occupies one **Snippet slot**

## Flagged ambiguities

- "border" was used for both the decorative PNG and the printing outline: resolved as **Frame** and **Cut line**.
- The unique URL was first attached to each Set; it belongs to a **Collection** that holds many Sets.
