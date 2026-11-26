# ChessMate Complete Upgrade

This package contains the complete ChessMate project with the premium admin and home-page updates.

## Included
- Premium black-and-gold glassmorphism Admin Dashboard.
- Refined Announcement Panel and top-of-page global announcement styling.
- Raining Tacos event controls (Start Event / End Event), existing taco-rain animation, and existing original event sound.
- Original garden-inspired home-page interaction chime with the existing Sound On / Sound Off control.
- Admin Update & Release Panel showing the current release version and scheduled-banner status.
- Existing Update Timer Banner markup and scheduling logic retained for future scheduled releases.
- Service Worker shell cache version incremented for this package.

## Release behavior
No scheduled countdown is active in this package. The Update Timer Banner and `public/pwa.js` scheduling mechanism remain in the project for future use.

The Admin Update & Release Panel is a status monitor. Publishing a new GitHub Pages build still happens through the repository deployment workflow; the static website cannot directly push source changes to GitHub.

## Audio note
The home-page chime is an original garden-inspired sound effect, not a recording or recreation of audio from another game. The existing Raining Tacos sound effect is preserved.
