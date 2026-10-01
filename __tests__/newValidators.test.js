const express = require("express");
const request = require("supertest");
const validate = require("../shared/middleware/validate.middleware");
const errorHandler = require("../shared/middleware/errorHandler.middleware");

const { createCategorySchema } = require("../validators/category.validators");
const { createReviewSchema } = require("../validators/review.validators");
const { applyForSellerSchema } = require("../validators/seller.validators");
const { staffLoginSchema } = require("../validators/staff.validators");

const appFor = (schema, part = "body") => {
  const app = express();
  app.use(express.json());
  app.post("/test", validate({ [part]: schema }), (req, res) => res.status(200).json({ ok: true }));
  app.use(errorHandler);
  return app;
};

const validObjectId = "507f1f77bcf86cd799439011";

describe("Admin validator schemas — category", () => {
  const app = appFor(createCategorySchema);
  test("rejects a missing name", async () => {
    const res = await request(app).post("/test").send({ description: "no name given" });
    expect(res.status).toBe(400);
  });
  test("accepts a name with an empty-string parentCategory (multipart 'no parent' case)", async () => {
    const res = await request(app).post("/test").send({ name: "Electronics", parentCategory: "" });
    expect(res.status).toBe(200);
  });
});

describe("Admin validator schemas — review", () => {
  const app = appFor(createReviewSchema);
  test("rejects a rating above 5", async () => {
    const res = await request(app)
      .post("/test")
      .send({ productId: validObjectId, orderId: validObjectId, rating: 6 });
    expect(res.status).toBe(400);
  });
  test("rejects a rating of 0", async () => {
    const res = await request(app)
      .post("/test")
      .send({ productId: validObjectId, orderId: validObjectId, rating: 0 });
    expect(res.status).toBe(400);
  });
  test("accepts a valid rating of 5 with a comment", async () => {
    const res = await request(app)
      .post("/test")
      .send({ productId: validObjectId, orderId: validObjectId, rating: 5, comment: "Great!" });
    expect(res.status).toBe(200);
  });
});

describe("Admin validator schemas — seller application", () => {
  const app = appFor(applyForSellerSchema);
  const validBase = {
    businessName: "Akash Traders",
    gstNumber: "22AAAAA0000A1Z5",
    accountHolderName: "Akash",
    accountNumber: "123456789012",
    bankName: "State Bank",
    bankBranch: "Agartala",
  };

  test("rejects a malformed IFSC code", async () => {
    const res = await request(app).post("/test").send({ ...validBase, ifscCode: "NOTVALID" });
    expect(res.status).toBe(400);
  });
  test("accepts a valid IFSC code (case-insensitive, gets uppercased)", async () => {
    const res = await request(app).post("/test").send({ ...validBase, ifscCode: "sbin0001234" });
    expect(res.status).toBe(200);
  });
  test("rejects a non-numeric account number", async () => {
    const res = await request(app).post("/test").send({ ...validBase, ifscCode: "SBIN0001234", accountNumber: "abc" });
    expect(res.status).toBe(400);
  });
  test("rejects a missing GSTIN — now required, not optional", async () => {
    const { gstNumber, ...withoutGst } = validBase;
    const res = await request(app).post("/test").send({ ...withoutGst, ifscCode: "SBIN0001234" });
    expect(res.status).toBe(400);
  });
  test("rejects a malformed GSTIN", async () => {
    const res = await request(app)
      .post("/test")
      .send({ ...validBase, ifscCode: "SBIN0001234", gstNumber: "not-a-gstin" });
    expect(res.status).toBe(400);
  });
});

describe("Admin validator schemas — staff login", () => {
  const app = appFor(staffLoginSchema);
  test("rejects a non-email companyEmail", async () => {
    const res = await request(app).post("/test").send({ companyEmail: "not-an-email", password: "x" });
    expect(res.status).toBe(400);
  });
  test("accepts a valid login payload", async () => {
    const res = await request(app)
      .post("/test")
      .send({ companyEmail: "staff@greencards-staff.com", password: "correcthorsebatterystaple" });
    expect(res.status).toBe(200);
  });
});
