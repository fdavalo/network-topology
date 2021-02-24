FROM registry.access.redhat.com/ubi8/nodejs-14:latest
RUN mkdir /opt/app-root/src/docroot
COPY *.js package.json *.sh /opt/app-root/src
COPY docroot/* /opt/app-root/src/docroot
WORKDIR /opt/app-root/src 
RUN npm i
CMD sh start.sh
