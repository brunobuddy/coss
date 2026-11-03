terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Created once by hand (infra/AGENTS.md): versioned, encrypted, private.
  backend "s3" {
    bucket       = "coss-org-tfstate-456651119109"
    key          = "organization/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = local.region
  allowed_account_ids = [local.management_account_id]

  default_tags {
    tags = {
      project   = "coss"
      managedBy = "terraform"
    }
  }
}

# Root sign-ins are recorded in us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [local.management_account_id]

  default_tags {
    tags = {
      project   = "coss"
      managedBy = "terraform"
    }
  }
}
