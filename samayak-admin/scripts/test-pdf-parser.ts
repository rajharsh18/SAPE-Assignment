import { parseTimetablePdf } from "../lib/pdf-parser";
import path from "path";

async function main() {
  const pdfPath = process.argv[2] || path.join(__dirname, "../../CSE(8).pdf");
  console.log(`Testing parser on: ${pdfPath}`);

  const result = await parseTimetablePdf(pdfPath);

  console.log(`Method: ${result.parseMethod}`);
  console.log(`Department: ${result.department}`);
  console.log(`Branches: ${result.branches.length}`);
  console.log(`Rooms: ${result.rooms.length}`);
  console.log(`Courses: ${result.courses.length}`);
  console.log(`Faculty: ${result.faculty.length}`);
  console.log(`Slots: ${result.slots.length}`);
  console.log(`Errors: ${result.parseErrors.length}`);

  if (result.slots.length === 0) {
    console.error("FAIL: No slots parsed");
    process.exit(1);
  }

  console.log("PASS: Parser extracted timetable data");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
