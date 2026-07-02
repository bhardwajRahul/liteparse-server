mkdir -p src/protogen

protoc --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./src/protogen \
  --ts_proto_opt=outputServices=grpc-js,env=node \
  --proto_path=./proto \
  ./proto/*.proto
