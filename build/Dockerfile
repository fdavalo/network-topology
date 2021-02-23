FROM registry.access.redhat.com/ubi8/nodejs-14:latest
COPY src /opt/app
WORKDIR /opt/app 
RUN npm i
CMD sh start.sh
