*(This repo is a fork of https://github.com/ibm-cloud-architecture/node-web-app, all the credits goes to [Roland Barcia](https://medium.com/ibm-garage/fun-with-gitops-stitching-kubernetes-tekton-and-argo-ee348afd0b08) and the team at the IBM Gragage.)*

# GitOps with Tekton and ArgoCD
## Simple Node JS App Soup to Nuts: From DeskTop Docker to OpenShift Cluster

This git repo is a simple contains a simple node applicaiton that uses argocd to deploy its tekton pipeline to OpenSHift 4.3.  It the uses Tekton to build an image, publish it to the Container Registry and executes an argo sync to deploy the app.  

![alt argo-flow-1](images/TektonArgoOpenShift.png)


### Run Node App and Test Locally with Docker

The Node Application is created following this tutorial simulating how a new user might learn to containerize a Node App.
[Dockerizing a Node.js web app](https://nodejs.org/fr/docs/guides/nodejs-docker-webapp/)

1. To run the application locally, [Install Docker Desktop](https://www.docker.com/products/docker-desktop).

2. You can run the app locally if you have [node](https://nodejs.org/en/) installed

```shell
cd node-web-app/
npm install
node server.js
```

3. Since you have the code, docker build with a tag

```shell
docker build -t <your username>/node-web-app .
```

4. Run the application in a container.

```shell
docker run -p 49162:8082 -d <your username>/node-web-app
```

5. Check that the container is running.

```shell
docker ps
```

6. Test the Application 

```shell
curl -i localhost:49162
```

### Change Pipeline Resource to your git repo.

This change is required to run a build from the console without a Trigger Event.  

![alt fork-repo](images/pipeline-resource-fork.png)

### Using OpenShift 4.3 as my Kubernetes Cluster 

You need your own 4.3 OpenShift Cluster.  Here are some options.  

I [installed OpenShift 4.3 into AWS following these instructions](https://docs.openshift.com/container-platform/4.3/installing/installing_aws/installing-aws-account.html).

You could use [Code Ready Containers](https://cloud.redhat.com/openshift/install/crc/installer-provisioned?intcmp=7013a000002CtetAAC) Locally.  

This tutorial can work also on any Kubernetes, but you have to install Tekton and use the [buildah](https://github.com/tektoncd/catalog/tree/v1beta1/buildah) task. 

### Needed CLI and log into OpenShift

You need the following CLI's 

- [kuberenetes](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
- [oc](https://docs.openshift.com/container-platform/4.3/cli_reference/openshift_cli/getting-started-cli.html#installing-the-cli)
- [tkn](https://openshift.github.io/pipelines-docs/docs/0.10.5/assembly_cli-reference.html)
- [argocd](https://argoproj.github.io/argo-cd/cli_installation/)


[Log into your OpenShift Cluster](https://docs.openshift.com/container-platform/4.3/cli_reference/openshift_cli/getting-started-cli.html#cli-logging-in_cli-developer-commands) should automatically log you into kubernetes and tekton.  

```
oc login --server=https://<OCP API Server>  --token=<Your Auth Token>
```
Your ID should use an ID with admin access since you will be installing a set of tools.  

You can also log into your OpenShift web console.  

### Install ArgoCD

Install ArgoCD

```shell
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Download ArgoCD CLI

```shell
brew install argocd
```

Change the argocd-server service type to LoadBalancer:

```shell
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'
```

Kubectl port-forwarding can also be used to connect to the API server without exposing the service.

```shell
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

The API server can then be accessed using the http://localhost:8080

Login Using the CLI, using the username `admin` and the password from below:

```shell
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Change the password using the command:

```shell
argocd login localhost:8080
argocd account update-password
```

Register a cluster `docker-desktop` to deploy apps to

```shell
argocd cluster add docker-desktop
```

### Install Tekton Pipelines

```shell
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/previous/v0.24.1/release.yaml
```

### Install the Argo CD Tekton Task into the argocd namespace

After tekton builds the application and pushes the container image into the Image Repository, tekton needs to trigger a new OpenShift Deployment.  There is a special task that allows Tekton to trigger a argocd sync.  You have to install the [Argo CD Tekton Task](https://github.com/tektoncd/catalog/tree/main/task/argocd-task-sync-and-wait/0.1).


```shell
kubectl apply -n argocd -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/argocd-task-sync-and-wait/0.1/argocd-task-sync-and-wait.yaml

```


### Create OCP Project 
You need to create an OpenShift project called node-web-project or you will need to change all namespaces in the YAML File to match your project 

```
oc new-project node-web-project
```

### Allow Pipeline to access registry for build and deploy
Your project will need the ability to publish and pull from the image repository.  

```
oc policy add-role-to-user registry-editor builder

oc policy add-role-to-user registry-editor deployer
```

### Update ArgoCD secret

![alt argo-secret](images/argosecret.png)

There is a file called `node-web-app-argocdsecret.template` which contains
* `argocd-env-configmap`: `ConfigMap` with `ARGOCD_SERVER` used for server address
* `argocd-env-secret`: `Secret` with `ARGOCD_USER` and `ARGOCD_PASSWORD` used for authentication

Create a copy of that file as yaml.

```shell
cd pipeline/
cp node-web-app-argocdsecret.template  node-web-app-argocdsecret.yaml
```

In the newly created file, replace the value for `ARGOCD_SERVER` (`localhost:8080`) to your server.  Either enter your `ARGOCD_AUTH_TOKEN` or User and Password Base 64 encoded.

### Examine Tekton Pipeline YAML

* [node-web-app-pipeline-resources.yaml](pipeline/node-web-app-pipeline-resources.yaml): [Pipeline Resources](https://github.com/tektoncd/pipeline/blob/main/docs/resources.md) are configured for the pipeline. We will create two resources (`git` and `image`), which will need the name of the git repository, and the name of the Container Image using the Docker Hub.  Note, the resources here allow us to run a Pipeline from the Tekton Dashboard or CLI. It hard codes default values. They will be overridden by Trigger Template when builds are done via a git push.


* [node-web-app-pipeline.yaml](pipeline/node-web-app-pipeline.yaml): Our [Pipeline](https://github.com/tektoncd/pipeline/blob/main/docs/pipelines.md) for building, publishing, and deploying our application. There are two [Tasks](https://github.com/tektoncd/pipeline/blob/main/docs/tasks.md).  We make use of the shared tasks rather than creating our own. Tasks:

   - the `build-and-publish-image` uses the ClusterTask buildah (podman build system).
   - `argocd-sync-deployment` uses the ArgoCD task we installed earlier


* [node-web-app-triggertemplate.yaml](pipeline/node-web-app-triggertemplate.yaml):  Now that the pipeline is setup, there are several resources created in this file.  They create the needed resources for triggering builds from an external source, in our case a Git webhook.  [You can learn more about Tekton Triggers here](https://github.com/tektoncd/triggers).  We have created the following.

   - A TriggerTemplate is used to create a template of the same pipeline resources, but dynamically genertaed to not hard code image name or source.  It also creates a PipelineRun Template that will be created when a build is triggered.

   - A TriggerBinding that binds the incoming event data to the template (this will populate things like git repo name, revision,etc....)

   - An EventListener that will create a pod application bringing together a binding and a template.

   - An OpenShift Route to expose the Event Listener.  Your will create a GIT Webhook that will callback this Route.

You can learn about [Tekton Resources](https://github.com/tektoncd/pipeline/tree/main/docs#learn-more) and [OpenShift Pipleines](https://openshift.github.io/pipelines-docs/docs/0.10.5/con_pipelines-concepts.html)


### Create and configure ArgoCD App for Tekton Resources 

We can use ArgoCD to deploy the Tekton build for the app.  IN a real project, having your pipeline in a separate repo might be better.  [You can create an argo cd app via the GUI or commandline](https://argoproj.github.io/argo-cd/getting_started/).

The screenshot below shows the parameters I entered.  You need to use your own forked git repo.  

![alt argo-pipeline](images/argo-node-web-pipeline.png) 

- Project: default
- cluster: (URL Of your OpenShift Cluster)
- namespace should be the name of your OpenShift Project
- Targer Revision: Head
- PATH: pipeline
- AutoSync Enabled.  

Once you run sync, your pipeline should be deployed and your screen in argo should look like below.  

![alt argo-pipeline](images/argocd-tekton-pipeline.png)

### Run a Build

At this point you can run a build.  The Build Should succeed, but the deploy should fail.  If you configure the deployment first however, deloyment will fail to start because the image has not been published.  

1. You can go into the Pipelines section of the OpenShift Console, right click the pipeline and click Start.

![alt kickoff](images/kickoffbuild.png)

2. You will see that the values are prepopulated with default PipelineResources as shown below.  


![alt default-resources](images/PipelineDefaultResouces.png)

3. The pipeline should run, the build should pass (Creates the Container Image and publishes it to the Container Registry).  The argo-cd sync should fail because we have not configured the argod app for deploying the node-web-project.  


![alt first-run](images/FirstRun.png)


### Examine Application 

Let's look at the OpenShift Configuration for our node application.

![alt deployment](images/deployment.png)

- [node-web-app-deployment.yaml](deployment/node-web-app-deployment.yaml) - This represents our Kubernetes Deployment. 

- [node-web-app-service.yaml](deployment/node-web-app-service.yaml):  This expose the node app to the cluster.

- [node-web-app-route.yaml](deployment/node-web-app-route.yaml): Exposes an OpenShift Route so you can access Node App from outside the cluster


### Create ArgoCD App for Web App Resources 

Just like we used argocd to deploy the tekton pipeline, you will create another argocd app that corresponds to the deployment.   [You can create an argo cd app via the GUI or commandline](https://argoproj.github.io/argo-cd/getting_started/).   

The screenshot below shows the parameters I entered.  You need to use your own forked git repo.  

![alt argo-pipeline](images/argo-node-web-app.png)

- Project: default
- cluster: (URL Of your OpenShift Cluster)
- namespace should be the name of your OpenShift Project
- repo url: should be your forked git repo.  
- Targer Revision: Head
- PATH: deployment
- AutoSync Disabled.  







### Sync Repo 
From here, you can trigger a sync manually by clicking sync.  Once your resources are deployed, your build from earlier is complete.  The screen should look like the figure below.  

![alt node-flow](images/argocd-node-flow.png)


### Run Pipeline 

1. You can go into the Pipelines section of the OpenShift Console, right click the pipeline and click Start.

![alt kickoff](images/kickoffbuild.png)

2. You will see that the values are prepopulated with default PipelineResources as shown below.  


![alt default-resources](images/PipelineDefaultResouces.png)

3. The pipeline should run, should now complete.  

![alt build-success](images/BuildSuccess.png)


### Configure Webhooks 

You will now need to configure 2 WebHooks.  

![alt webhooks](images/webhooks.png)

1. One WebHook will be configured to our argocd pipeline app.  This will enabled you to push changes to your pipeline plus for argocd to detect changes for your app (though autosync is not on)

    ![alt webhooks](images/argowebhook.png)


2. One webhook will go to your Tekton Event Listener to start a tekton build from git push

    ![alt webhooks](images/tekton-webhook.png)

### Make a code change and commit, look at build.   



1. Make a change to the deployment YAML.

    ![alt change-deployment](images/deployment-change.png)

2. Make a change to the Node JS Code.  


    ![alt webhooks](images/changecode.png)

3. Push the changes to your repo

```

git add .
git commit -m "First Deployment"
git push

```

    In a real deployment, you might have many webhooks.  git push can be build to dev while a git tag can be a build for test.  


3. Go to the OpenShift Console and you should see a pipleine run kickoff.  Wait till it is complete.  Notice the name of the pipleine run matches that in the tigger template.

    ![alt webhooks](images/gittrigger.png)

4. While waiting for the build, go to pipeline resources section and look to see new pipeline resources created for the webhook build.  It will dynamically create a resource for build so you know what parameters were used to run the build.  

    ![alt resourcebuild](images/pipelineresourcebuild.png)


5. Go back to the Pipeline Runs and check that the build is complete.  


    ![alt success](images/pipelinesuccess.png)


6. Go to the Topology view on the Developer Side and launch the app as shown.


    ![alt success](images/LaunchApp.png)


7.  If it all works out, your app should look like this




This completes loading the solution.


#### Troubleshooting

- argocd runs in an argocd namespace.  Yourtekton pipleine runs in your app namespace.  

- using tkn log <resource> intance to see tekton activity

- oc logs <resource> for various pods

- Redeploying TriggerTemplate does not cause the Event App to restart.  Delete pod to run new instance.  



