# Product → Label

Chrome extension for product labels from McMaster-Carr and AutomationDirect. Load the extension/ folder unpacked in Chrome, open a product detail page, and click the extension. Optional lookup accepts product links; AutomationDirect part numbers are also supported.

## Design labels

All layouts are editable records in the Layout dropdown. Starting layouts are provided once and can be edited or deleted. **Create new layout** opens a fresh editable arrangement. Use the visibility checkboxes to hide any element, drag visible elements in the preview, and use the Size slider to resize the selected element. The selection outline is only a preview guide.

Enter a name and choose **Save as new layout** to add a dropdown choice. Changes to an existing layout become a draft; **Update saved layout** updates the entered name. Saved layouts retain visibility, positions, sizes, and 0°, 90°, 180°, or 270° rotation. There is no app-imposed layout count limit; available Chrome local storage is the practical limit. Designs and selection preferences are stored locally on this computer.

## Label sizes and printing

Choose an existing Label size, or expand **Add a label size** and enter its name, width, and height in inches (0.25–24 inches). Custom sizes persist and can be selected like the presets. Layouts saved for a particular size appear when that size is selected; starting templates are available across sizes.

Printing always opens Chrome’s print dialog. The app sends the chosen physical dimensions through CSS @page and the label image size; quarter-turns swap width and height. The extension does not select a printer or install paper stocks. The printer driver must support/match the selected stock; Chrome may require you to select that stock under More settings. Use no margins, 100% scale, no headers/footers, and one dialog copy (the app creates each copy). Verify the preview and QR readability after resizing; overlapping elements can obscure each other.

## Saved layouts and future defaults

**Export saved layouts** downloads the saved geometry, visibility, rotation, and custom sizes as JSON. Keep this for backup or share the chosen layouts to promote into future built-in defaults. The editor remains available; no new default designs are imposed while you experiment.

## AutomationDirect attributes

The popup reads the rendered product attribute table and lets you select fields instead of printing the standard description. Field selections persist per product (last 50 products). Verified on real C0-00DD1-D and C0-02DD1-D pages on October 16, 2026. Website changes, missing products, or access challenges can prevent lookup. McMaster retains editable descriptions and product images. Physical printer output must be checked on your own printer.

## Development

Plain MV3 browser JavaScript, no build required. npm ci installs test dependencies; npm test runs the regression suite. npm run layouts generates a visual layout sheet. npm run package creates an extension archive. See LICENSE for the original MIT license.

## Modular fields

Add text or code fields, choose each field’s type, and edit its name, content, font family, point size (0 means automatic), bold, italic, alignment, position and box dimensions. Drag a box or its blue corner handle; box resizing is independent of explicit font size. Installed system fonts may be entered by name; unavailable fonts fall back to a browser font. Remove hides original fields or deletes added fields.

Under Content bindings by website, bind the same element independently to each supplier’s company, part number, product description, selected attributes, URL, or an attribute by name. Fixed text/templates support {company}, {partNumber}, {description}, {selectedAttributes}, and {url}. Explicit bindings override template text; unavailable attributes produce empty content. All geometry and style remain stable as data changes between sites. More suppliers require adding an extractor/permission and binding source.

Invert this element or the entire label swaps black and white colors. This is separate from 90-degree rotation. Saved layouts retain inversion, custom fields, fonts, types and site bindings. The offline bwip-js 4.11.4 bundle exposes its available barcode and 2D-code formats, including Code 128, EAN/UPC, Data Matrix, PDF417, Aztec and QR. Formats impose their own data rules; invalid content and boxes too small to encode a code block printing with a design error. Advanced options accept a bwip-js JSON options object. Test actual scanner readability after changing code size or polarity. See extension/lib/bwip-js-NOTICE.txt for library provenance and licenses.

## Detected product fields

McMaster and AutomationDirect now share the Detected product fields checkboxes. Select specific specs (such as Thread Size, Length or Material) instead of relying on the generic description. Toggle Use selected fields as label text off to retain an editable description. Choices persist separately by site and part number for the last 100 products. The Detected website field dropdown in the editor binds any selected element directly to a current-page field. Discovered field names also appear in each site’s binding menu. Missing attributes stay empty instead of being guessed from prose. {labelText} follows the description/selected-field toggle; {selectedAttributes} always expands to the checked specs.

McMaster parsing was verified on the real rendered specification tables for 91290A115 (28 fields) and 9541K43 (25 fields) on October 20, 2026. Grouped labels are preserved as Thread Size, Thread Spacing, Head Diameter, etc. Pages with unsupported or unavailable table markup fall back to the existing description workflow.
