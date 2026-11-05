# frozen_string_literal: true

module Coss
  module Types
    # The submission.
    class FormSubmissionWebhookEventData < Internal::Types::Model
      field :form_id, -> { String }, optional: false, nullable: false

      field :form_name, -> { String }, optional: false, nullable: false

      field :submission_id, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::FormSubmissionWebhookEventDataStatus }, optional: false, nullable: false

      field :data, -> { Internal::Types::Hash[String, Coss::Types::FormSubmissionWebhookEventDataDataValue] }, optional: false, nullable: false

      field :submitter_email, -> { String }, optional: false, nullable: true

      field :files, -> { Internal::Types::Array[Coss::Types::FormSubmissionFile] }, optional: false, nullable: false

      field :spam_reason, -> { Coss::Types::FormSubmissionWebhookEventDataSpamReason }, optional: false, nullable: true

      field :sandbox, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
