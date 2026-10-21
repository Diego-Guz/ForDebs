# For you: how to finish and send it

## 1. Add your photos
Put 4 photos in `assets/photos/` and name them:

```
photo1.jpg
photo2.jpg
photo3.jpg
photo4.jpg
```

`.jpeg`, `.png` and `.webp` work too. Until a photo is there, that spot shows a soft placeholder.

From an iPhone, AirDrop or email the photos to your computer. They usually arrive as `.jpg`. If one arrives as `.heic`, open it and export it as JPG, because Chrome can't show `.heic`.

## 2. Change the words
Open `index.html` in any text editor (TextEdit, Notepad, VS Code). Look for `EDIT:` comments and anything in [square brackets]:

- `[Her name]` (in two places)
- `[caption]` under each photo (keep these short, a few words)
- the date stamps like `'25 06 14` (film-camera style: year, month, day). Delete a stamp line if you don't want it.
- the little handwritten notes above each photo ("remember this?")
- `[A memory only the two of you would know.]`
- `[Your name]`

## 3. Music (optional)
The page plays a small original music-box song made in code, so you don't need to do anything.
To use your own song instead, put an MP3 at `assets/music/song.mp3`. The page uses it automatically.

## 4. Preview it
Double-click `index.html` to open it in your browser. Tap "Open it" and scroll.

## 5. Put it online so she can open it on her phone
The easiest free way is **Netlify Drop**:
1. Go to https://app.netlify.com/drop
2. Drag the whole `for-you` folder onto the page.
3. It gives you a link like `https://something.netlify.app`. Open it on your own iPhone first to check it.
4. Text her that link, after she says it's okay.

(GitHub Pages works too if you already use GitHub.)

## iPhone notes
- Music starts when she taps "Open it". iPhones only allow sound after a tap.
- On newer iPhones the music plays even with the silent switch on. On older ones, she may need the switch off.
- There's a small button in the bottom-right corner to turn the music on or off.
