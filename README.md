# ✨ Advanced JSON Comparator ✨

Ever needed to pinpoint the differences between two JSON files, especially when they're packed with different kinds of data? This Advanced JSON Comparator is here to help! Built with Next.js and Shadcn/UI, it dives into your JSON arrays, intelligently figures out the various object "shapes" within them, and lets you specify the unique identifier (key field) for each. Then, it clearly lays out everything that's new, changed, or been removed.

## What Makes It Cool? (Key Features)

- **Spot Differences with Ease**: Compare two JSON arrays by pasting text or uploading `.json` files for a "Before" and "After" view.
- **Handles Mixed Data Like a Pro**: The tool cleverly groups objects based on their structure (the set of keys they contain). This means your JSONs can have different "kinds" of items, and it'll understand them separately.
- **You Choose the "ID" for Each Object Type**: For each distinct object structure found in _both_ your JSONs, you get to pick which field acts as its unique identifier. This gives you precise control over how items are matched up.
- **See Every Change**: Get a full picture with clear, organized lists of new, modified, and deleted items.
- **Zoom In on Modifications**: For anything that's changed, see exactly which fields were added, removed, or had their values updated. A side-by-side of the entire old and new object is just a click away in a handy pop-up.
- **User-Friendly Interface**: Clean tables make results easy to scan, and it looks great in both light and dark mode, adapting to your screen.
- **Helpful Feedback**: Get alerts for any JSON parsing issues, file type problems, or warnings during the comparison.

## Built With

- **Framework**: [Next.js](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Components**: [Shadcn/UI](https://ui.shadcn.com/) (using Radix UI + Tailwind CSS)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Object Comparison**: [Lodash (`isEqual`)](https://lodash.com/docs/4.17.15#isEqual)

## Get It Running Locally

1.  **Clone the repo:**

    ```bash
    git clone [https://github.com/jlwilley/JsonCompare](https://github.com/jlwilley/JsonCompare) # Update with your repo URL
    cd JsonCompare
    ```

2.  **Install the goodies:**

    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Shadcn/UI Setup (if needed):**
    If you're setting this up fresh or are missing components, you might need to:

    ```bash
    npx shadcn-ui@latest init
    # Then add any components the app uses (like select, dialog, table, etc.):
    npx shadcn-ui@latest add select button textarea label input card alert scroll-area table dialog
    ```

4.  **Start the dev server:**

    ```bash
    npm run dev
    # or
    yarn dev
    ```

5.  **Open in your browser:**
    Head to `http://localhost:3000` (or whatever port it tells you).

## How to Use It

1.  **Load Your JSONs**:

    - Pop your "Before" JSON array into the left-hand text area, or hit "Upload Before JSON File" for a `.json` file.
    - Do the same for your "After" JSON array on the right. (Both need to be arrays of objects!).

2.  **Teach the Tool About Your Keys (The Smart Part!)**:

    - Once your JSONs are in, the comparator looks at all the objects and figures out the different "structures" or "shapes" (types of objects based on the keys they have).
    - You'll then see a "Configure Key Fields" section. This is where you tell the tool how to match items.
    - For each object structure that appears in _both_ of your JSONs, you'll need to pick a unique ID field from a dropdown. The tool helps by suggesting fields that are always present as non-empty strings in all objects of that particular structure.
    - _(What if an object type is only in one JSON? No problem! You don't need to pick a key for those – they'll automatically show up as entirely new or deleted.)_

3.  **Hit "Compare JSONs"**:

    - Once you've set up your keys for any common object types, this button will light up. Click it!

4.  **Check Out the Results**:

    - You'll get neatly organized tables showing:
      - **New Entries**: Fresh items in your "After" JSON.
      - **Modified Entries**: Items that changed between "Before" and "After."
      - **Deleted Entries**: Items from "Before" that are now gone.

5.  **Dig Deeper into Changes**:
    - Curious about a modified item? Just click its row in the "Modified Entries" table.
    - A pop-up will show you the item's complete "Before" and "After" states, side-by-side, plus a highlighted list of exactly what fields were added, removed, or changed.

## Project Structure (Quick Look)

- `pages/index.tsx` (or your main page file): This is where the `App` component and the core comparator logic live.
- `components/ui/`: Home to the lovely Shadcn/UI components.
- `public/`: Any static files.

## Room for More Awesomeness (Future Ideas)

- Let users ignore certain fields during comparison (globally or per object type).
- Smarter ways to match object "types" if their key sets aren't _exactly_ the same.
- An option to export the comparison results (maybe to a summary JSON or CSV).
- Even better performance for truly massive JSON files.

## Author & Thanks

- Designed and Developed by [jlwilley](https://jlwilley.com)
- Built out of a need for a smarter way to compare complex JSON.
- Big thanks to the creators of Shadcn/UI for the fantastic components!

---
