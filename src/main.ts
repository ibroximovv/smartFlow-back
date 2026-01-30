import Application from "./api/app.service";

async function bootstrap() {
  await Application.main();
}
bootstrap();