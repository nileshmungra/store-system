import { defineRailway, project, service, database } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    build: "pip install -r requirements.txt",
    start: "uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2",
    env: {
      NODE_ENV: "production",
    },
  });

  const db = database("db", {
    engine: "mysql",
    plan: "basic-0",
  });

  return project("Bhumi-Store-App", {
    resources: [web, db],
  });
});
