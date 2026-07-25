pipeline {
    agent any

    options {
        timestamps()
        ansiColor('xterm')
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '5'))
    }

    parameters {
        choice(
            name: 'ACTION',
            choices: ['Deploy', 'Rollback'],
            description: 'Deploy the admin API or roll back to the previous image'
        )
        string(
            name: 'NOTIFICATION_EMAIL',
            defaultValue: 'arunmhere62@gmail.com',
            description: 'Recipient for deployment notifications'
        )
    }

    environment {
        APP_IMAGE = 'ipgm-admin-api'
        COMPOSE_FILE = 'docker-compose.yml'
        COMPOSE_PROJECT = 'ipgm-admin-api'
        CONTAINER_NAME = 'ipgm-admin-api'
        NETWORK_NAME = 'ipgm-admin-api-network'
        BACKEND_HOST = 'ipgm-admin-api'
        APP_PORT = '3000'
        HEALTH_ENDPOINT = '/api/web/v1/health'
        MAX_HEALTH_RETRIES = '12'
        HEALTH_RETRY_DELAY = '5'

        DOCKER_BUILDKIT = '1'
        BUILDKIT_PROGRESS = 'plain'
        COMPOSE_DOCKER_CLI_BUILD = '1'
    }

    stages {
        stage('Rollback') {
            when { expression { params.ACTION == 'Rollback' } }
            steps {
                script {
                    rollbackDeployment()
                }
            }
        }

        stage('Checkout') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    checkout scm
                    env.GIT_COMMIT_SHORT = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                    env.GIT_BRANCH_NAME = normalizeBranchName(env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown')
                    env.IMAGE_FQN = "${env.APP_IMAGE}:${env.GIT_COMMIT_SHORT}"

                    echo '============================================'
                    echo "Action: ${params.ACTION}"
                    echo "Branch: ${env.GIT_BRANCH_NAME}"
                    echo "Commit: ${env.GIT_COMMIT_SHORT}"
                    echo "Image: ${env.IMAGE_FQN}"
                    echo '============================================'
                }
            }
        }

        stage('Install Dependencies') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                sh 'npm install --legacy-peer-deps'
            }
        }

        stage('Generate Prisma Clients') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                sh 'npm run prisma:generate:all'
            }
        }

        stage('Build NestJS Application') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                sh 'npm run build'
            }
        }

        stage('Build Docker Image') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                sh """
                    docker build \
                        -t ${env.IMAGE_FQN} \
                        -f Dockerfile \
                        .
                """
            }
        }

        stage('Deploy') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    deployApplication(env.IMAGE_FQN)
                }
            }
        }

        stage('Health Check') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    waitForHealthyApplication()
                    env.DEPLOY_SUCCESSFUL = 'true'
                }
            }
        }

        stage('Deployment Summary') {
            when {
                allOf {
                    expression { params.ACTION != 'Rollback' }
                    expression { env.DEPLOY_HAPPENED == 'true' }
                }
            }
            steps {
                script {
                    printDeploymentSummary()
                }
            }
        }
    }

    post {
        always {
            script {
                if (params.ACTION != 'Rollback') {
                    sh 'docker image prune -f'
                }
            }
        }
        success {
            script {
                echo '============================================'
                echo 'RESULT: SUCCESS'
                echo "Action: ${params.ACTION}"
                echo "Image: ${env.IMAGE_FQN ?: 'Rollback mode'}"
                echo '============================================'
                sendDeploymentEmail('SUCCEEDED', 'Admin API deployment completed and passed the health check.')
            }
        }
        unstable {
            script {
                echo '============================================'
                echo 'RESULT: UNSTABLE'
                echo "Image: ${env.IMAGE_FQN ?: 'Rollback mode'}"
                echo '============================================'
            }
        }
        failure {
            script {
                echo '============================================'
                echo 'RESULT: FAILURE'
                echo "Image: ${env.IMAGE_FQN ?: 'unknown'}"
                echo '============================================'
                if (params.ACTION != 'Rollback' && env.DEPLOY_HAPPENED == 'true' && env.DEPLOY_SUCCESSFUL != 'true') {
                    echo 'Deployment did not reach healthy state. Attempting automatic rollback...'
                    rollbackDeployment()
                }
                sendDeploymentEmail('FAILED', 'Admin API deployment failed. Review the Jenkins build log for details.')
            }
        }
        aborted {
            script {
                echo '============================================'
                echo 'RESULT: ABORTED'
                echo '============================================'
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

def sendDeploymentEmail(String status, String message) {
    def subject = "[IPMS Admin API] ${status} | Build #${env.BUILD_NUMBER}"
    def body = """Admin API deployment ${status.toLowerCase()}.

${message}

Branch: ${env.GIT_BRANCH_NAME ?: 'main'}
Commit: ${env.GIT_COMMIT_SHORT ?: 'unknown'}
Image: ${env.IMAGE_FQN ?: 'unknown'}
Build: ${env.BUILD_URL ?: 'unavailable'}
""".stripIndent()

    try {
        mail to: params.NOTIFICATION_EMAIL, subject: subject, body: body
    } catch (Exception e) {
        echo "WARNING: Could not send deployment email: ${e.message}"
    }
}

def normalizeBranchName(String rawBranch) {
    if (!rawBranch) return 'unknown'
    def branch = rawBranch.replaceAll(/^origin\//, '')
    return branch.replaceAll(/[^a-zA-Z0-9_-]/, '-')
}

def composeCommand() {
    return 'docker compose'
}

def ensureNetworkExists(String networkName) {
    def exists = sh(returnStatus: true, script: "docker network inspect ${networkName} >/dev/null 2>&1")
    if (exists == 0) {
        echo "Network ${networkName} already exists."
    } else {
        sh "docker network create ${networkName}"
        echo "Created network ${networkName}."
    }
}

def prepareEnvFile() {
    if (fileExists('.env')) {
        echo 'Using existing .env file in workspace.'
        return
    }

    def envCredentialId = 'ipgm-admin-api-env-file'

    try {
        withCredentials([file(credentialsId: envCredentialId, variable: 'SECRET_ENV_FILE')]) {
            sh 'cp "$SECRET_ENV_FILE" .env'
            sh 'chmod 600 .env'
        }
        echo 'Wrote .env file from Jenkins secret file credential.'
    } catch (Exception e) {
        echo "WARNING: Could not load Jenkins credential '${envCredentialId}' and no .env file present. Continuing anyway."
    }
}

def tagPreviousImage() {
    def runningContainer = sh(
        returnStdout: true,
        script: "docker ps -q --filter name=^/${env.CONTAINER_NAME}\$ --filter ancestor=${env.APP_IMAGE} || true"
    ).trim()

    if (!runningContainer) {
        echo 'No running backend container found; skipping previous-image tag.'
        return
    }

    def currentImage = sh(
        returnStdout: true,
        script: "docker inspect --format='{{.Config.Image}}' ${runningContainer} || true"
    ).trim()

    if (currentImage) {
        sh "docker tag ${currentImage} ${env.APP_IMAGE}:previous"
        echo "Tagged previous image: ${currentImage} -> ${env.APP_IMAGE}:previous"
    } else {
        echo "WARNING: Could not determine image of running container ${runningContainer}."
    }
}

def deployApplication(String imageTag) {
    prepareEnvFile()
    ensureNetworkExists(env.NETWORK_NAME)
    tagPreviousImage()

    env.DEPLOY_HAPPENED = 'true'

    sh """
        export APP_IMAGE=${env.APP_IMAGE}
        export APP_TAG=${env.GIT_COMMIT_SHORT}
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} down --remove-orphans
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} up -d --force-recreate
    """

    echo "Deployed ${imageTag} to admin-api"
}

def rollbackDeployment() {
    def previousImage = "${env.APP_IMAGE}:previous"
    def imageExists = sh(returnStatus: true, script: "docker image inspect ${previousImage} >/dev/null 2>&1")

    if (imageExists != 0) {
        echo "WARNING: Rollback image ${previousImage} not found. Skipping rollback."
        return
    }

    ensureNetworkExists(env.NETWORK_NAME)

    sh """
        export APP_IMAGE=${env.APP_IMAGE}
        export APP_TAG=previous
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} down --remove-orphans
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} up -d --force-recreate
    """

    echo "Rolled back to ${previousImage}"
}

def waitForHealthyApplication() {
    def healthy = false
    def maxAttempts = env.MAX_HEALTH_RETRIES.toInteger()

    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        sleep env.HEALTH_RETRY_DELAY.toInteger()

        def exitCode = sh(
            returnStatus: true,
            script: """
                docker run --rm --network ${env.NETWORK_NAME} curlimages/curl:latest \
                    -fsS --max-time 10 http://${env.BACKEND_HOST}:${env.APP_PORT}${env.HEALTH_ENDPOINT}
            """
        )

        if (exitCode == 0) {
            healthy = true
            echo "Health check passed on attempt ${attempt}/${maxAttempts}"
            break
        }

        echo "Health check attempt ${attempt}/${maxAttempts} failed, retrying..."
    }

    if (!healthy) {
        error("Application health check failed after ${maxAttempts} attempts on port ${env.APP_PORT}")
    }
}

def printDeploymentSummary() {
    def timestamp = sh(returnStdout: true, script: 'date "+%Y-%m-%d %H:%M"').trim()
    echo """
==================================
Admin API Deployment Successful
==================================

Branch    : ${env.GIT_BRANCH_NAME}
Commit    : ${env.GIT_COMMIT_SHORT}
Image     : ${env.IMAGE_FQN}

Container : ${env.CONTAINER_NAME}
Network   : ${env.NETWORK_NAME}

Time      : ${timestamp}

==================================
    """.stripIndent()
}
