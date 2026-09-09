// Run: node src/lib/validate.test.mjs
// Covers the write-path trust boundary and the RLS/UI permission mirror.
import assert from "node:assert/strict";
import { Validator, describeDbError, field } from "./validate.ts";
import {
  canCreateCustomer,
  canDeleteCustomer,
  canEditCustomer,
} from "./permissions.ts";

const fd = (obj) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
};

/* ---- field ---- */
assert.equal(field(fd({ a: "  x  " }), "a"), "x", "trims");
assert.equal(field(fd({}), "missing"), "", "missing entry is empty string");

/* ---- required ---- */
let v = new Validator(fd({ legal_name: "Acme" }));
assert.equal(v.required("legal_name", "Legal name"), "Acme");
assert.ok(v.ok, "valid input produces no errors");

v = new Validator(fd({ legal_name: "   " }));
v.required("legal_name", "Legal name");
assert.ok(!v.ok, "whitespace-only fails required");
assert.match(v.errors.legal_name, /required/, "names the problem");

v = new Validator(fd({ legal_name: "x".repeat(201) }));
v.required("legal_name", "Legal name");
assert.ok(!v.ok, "over-length fails");

/* ---- optional ---- */
v = new Validator(fd({ trading_name: "" }));
assert.equal(v.optional("trading_name", "Trading name"), null, "empty becomes null, not empty string");
assert.ok(v.ok, "empty optional is not an error");

v = new Validator(fd({ vat_number: "x".repeat(51) }));
v.optional("vat_number", "VAT number", 50);
assert.ok(!v.ok, "optional still enforces max length");

/* ---- optionalEmail ---- */
v = new Validator(fd({ email: "" }));
assert.equal(v.optionalEmail("email", "Email"), null, "blank email allowed");
assert.ok(v.ok);

v = new Validator(fd({ email: "hello@elonhub.co.za" }));
assert.equal(v.optionalEmail("email", "Email"), "hello@elonhub.co.za", "valid address passes");
assert.ok(v.ok);

for (const bad of ["nope", "a@b", "a b@c.com", "@no.com", "no@.com"]) {
  v = new Validator(fd({ email: bad }));
  v.optionalEmail("email", "Email");
  assert.ok(!v.ok, `rejects ${JSON.stringify(bad)}`);
}

/* ---- describeDbError never leaks driver detail ---- */
const rls = describeDbError({ code: "42501", message: "new row violates row-level security policy" });
assert.match(rls, /role does not allow/, "RLS rejection is explained in plain language");
assert.ok(!/row-level security/.test(rls), "does not echo the raw policy message");
assert.match(describeDbError({ code: "23505", message: "dup" }), /already exists/);
assert.match(describeDbError({ message: "boom" }), /Could not save/, "unknown errors still say something");

/* ---- permissions mirror 0002_rls.sql ---- */
assert.ok(canCreateCustomer("salesperson"), "salesperson may create");
assert.ok(canCreateCustomer("sales_manager"), "sales_manager may create");
assert.ok(canCreateCustomer("super_admin"), "super_admin may create");
// customers_write omits director on purpose: reads everything, creates nothing.
assert.ok(!canCreateCustomer("director"), "director may NOT create customers");
assert.ok(!canCreateCustomer("employee"), "employee may not create");
assert.ok(!canCreateCustomer("client"), "client may not create");

assert.ok(canDeleteCustomer("sales_manager"), "sales_manager may delete");
assert.ok(!canDeleteCustomer("salesperson"), "salesperson may not delete");

assert.ok(canEditCustomer("sales_manager", null, "u1"), "leadership edits regardless of owner");
assert.ok(canEditCustomer("salesperson", "u1", "u1"), "salesperson edits own");
assert.ok(!canEditCustomer("salesperson", "u2", "u1"), "salesperson cannot edit another's");
assert.ok(!canEditCustomer("salesperson", null, "u1"), "unowned is not editable by salesperson");

console.log("validate + permissions: all assertions passed");
