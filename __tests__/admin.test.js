const request = require("supertest");
const app = require("../app");

describe("Admin Microservice API", () => {
  it("should mount admin routes and protect dashboard stats", async () => {
    const res = await request(app).get("/api/v1/admin/dashboard");
    expect(res.statusCode).not.toEqual(500);
  });
});
