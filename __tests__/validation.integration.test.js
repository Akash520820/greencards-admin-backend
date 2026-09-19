const request = require("supertest");
const app = require("../app");

describe("Admin Microservice Route & Validation Enforcement", () => {
  test("protected admin routes return 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/v1/admin/dashboard");
    expect(res.status).toBe(401);
  });
});
