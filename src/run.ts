import { app } from "./slim";

const port = 5707;

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
