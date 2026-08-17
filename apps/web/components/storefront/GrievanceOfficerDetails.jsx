import {
  STORE_EMAIL,
  STORE_GRIEVANCE_OFFICER_DESIGNATION,
  STORE_GRIEVANCE_OFFICER_NAME,
  STORE_PHONE,
  STORE_PHONE_TEL,
} from "@/lib/storeContact";

export default function GrievanceOfficerDetails() {
  return (
    <ul>
      <li>
        Name: {STORE_GRIEVANCE_OFFICER_NAME}
      </li>
      <li>
        Designation: {STORE_GRIEVANCE_OFFICER_DESIGNATION}
      </li>
      <li>
        Email:{" "}
        <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>
      </li>
      <li>
        Phone:{" "}
        <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE}</a>
      </li>
    </ul>
  );
}
