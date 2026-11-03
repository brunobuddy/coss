terraform {
  # Write-only arguments (password_wo) keep the database password out of the state.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Created once by hand (README, "Deploying to AWS"): versioned, encrypted, private.
  backend "s3" {
    bucket       = "coss-tfstate-294417174674"
    key          = "production/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      project   = "coss"
      stage     = var.stage
      managedBy = "terraform"
    }
  }
}

# CloudFront certificates and CLOUDFRONT-scoped WAF ACLs live in us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      project   = "coss"
      stage     = var.stage
      managedBy = "terraform"
    }
  }
}
