import path from "path";
import { fileURLToPath } from "url";
import { parseTimetablePdf } from "../lib/pdf-parser.js";
import { isPopplerAvailable } from "../lib/pdf-vision-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pdfPath = process.argv[2] || path.join(__dirname, "../../CSE(8).pdf");
  console.log(`Testing parser on: ${pdfPath}`);
  console.log(`Poppler (pdftoppm) available: ${await isPopplerAvailable()}`);

  const result = await parseTimetablePdf(pdfPath);

  console.log(`Method: ${result.parseMethod}`);
  console.log(`Department: ${result.department}`);
  console.log(`Branches: ${result.branches.length}`);
  console.log(`Rooms: ${result.rooms.length}`);
  console.log(`Courses: ${result.courses.length}`);
  console.log(`Faculty: ${result.faculty.length}`);
  console.log(`Slots: ${result.slots.length}`);
  console.log(`Errors: ${result.parseErrors.length}`);

  if (result.branches.length > 0) {
    console.log("Sample branch:", result.branches[0]);
  }
  if (result.slots.length > 0) {
    console.log("Sample slot:", result.slots[0]);
  }
  if (result.parseErrors.length > 0) {
    console.log("First error:", result.parseErrors[0]);
  }

  if (result.slots.length === 0 && result.courses.length === 0) {
    console.error("\nFAIL: No timetable data extracted.");
    console.error(
      "Ensure poppler-utils is installed and GROQ_API_KEY is set (Docker worker has both).",
    );
    process.exit(1);
  }

  console.log("\nPASS: Parser extracted timetable data");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
