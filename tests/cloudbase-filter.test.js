import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCloudbaseFilter } from "../server/cloudbase-filter.js";

const command = new Proxy(
  {},
  {
    get(_target, operator) {
      return (...operands) => ({ operator, operands });
    },
  },
);

test("CloudBase filters compile mixed condition and group connectors", () => {
  const result = compileCloudbaseFilter(command, {
    groups: [
      {
        conditions: [
          { field: "status", type: "string", operator: "eq", value: "paid" },
          { join: "and", field: "amount", type: "number", operator: "gte", value: "100" },
        ],
      },
      {
        join: "or",
        conditions: [
          { field: "retryCount", type: "number", operator: "lt", value: "3" },
        ],
      },
    ],
  });
  assert.equal(result.operator, "or");
  assert.equal(result.operands[0].operator, "and");
  assert.equal(result.operands[0].operands[1].amount.operands[0], 100);
  assert.equal(result.operands[1].retryCount.operands[0], 3);
});

test("CloudBase filters support regex, multi-value array matching, and existence", () => {
  const result = compileCloudbaseFilter(command, {
    groups: [
      {
        conditions: [
          { field: "tag", type: "string", operator: "regex_i", value: "^a+b$" },
          {
            join: "or",
            field: "scores",
            type: "array",
            arrayItemType: "number",
            operator: "any_eq",
            value: ["2", 3],
          },
          { join: "and", field: "deletedAt", type: "string", operator: "not_exists" },
        ],
      },
    ],
  });
  assert.equal(result.operator, "and");
  assert.equal(result.operands[0].operator, "or");
  assert.equal(result.operands[0].operands[0].tag.source, "^a+b$");
  assert.equal(result.operands[0].operands[0].tag.flags, "i");
  assert.deepEqual(result.operands[0].operands[1].scores.operands, [[2, 3]]);
  assert.deepEqual(result.operands[1].deletedAt, { operator: "exists", operands: [false] });
});

test("CloudBase filters support boolean array values and legacy array types", () => {
  const result = compileCloudbaseFilter(command, {
    groups: [{
      conditions: [
        {
          field: "flags",
          type: "array",
          arrayItemType: "boolean",
          operator: "any_neq",
          value: ["true", false],
        },
        { join: "and", field: "tags", type: "array_string", operator: "any_eq", value: "vip" },
      ],
    }],
  });
  assert.deepEqual(result.operands[0].flags, { operator: "nin", operands: [[true, false]] });
  assert.deepEqual(result.operands[1].tags, { operator: "in", operands: [["vip"]] });
});

test("CloudBase null filters distinguish null values from missing fields", () => {
  const empty = compileCloudbaseFilter(command, {
    groups: [{ conditions: [{ field: "deletedAt", type: "null", operator: "eq" }] }],
  });
  const notEmpty = compileCloudbaseFilter(command, {
    groups: [{ conditions: [{ field: "deletedAt", type: "null", operator: "neq" }] }],
  });

  assert.deepEqual(empty, {
    operator: "and",
    operands: [
      { deletedAt: { operator: "exists", operands: [true] } },
      { deletedAt: { operator: "eq", operands: [null] } },
    ],
  });
  assert.deepEqual(notEmpty, {
    operator: "and",
    operands: [
      { deletedAt: { operator: "exists", operands: [true] } },
      { deletedAt: { operator: "neq", operands: [null] } },
    ],
  });
});

test("CloudBase filters reject invalid fields and incompatible operators", () => {
  assert.throws(
    () =>
      compileCloudbaseFilter(command, {
        groups: [{ conditions: [{ field: "$where", type: "string", operator: "eq", value: "x" }] }],
      }),
    /字段名/,
  );
  assert.throws(
    () =>
      compileCloudbaseFilter(command, {
        groups: [{ conditions: [{ field: "name", type: "string", operator: "gt", value: "x" }] }],
      }),
    /大小比较/,
  );
  assert.throws(
    () =>
      compileCloudbaseFilter(command, {
        groups: [{ conditions: [{ field: "tags", type: "array", operator: "any_eq", value: ["x"] }] }],
      }),
    /数组元素类型/,
  );
});
