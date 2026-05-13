package com.readmates.auth.application.port.out

class MemberAccountDuplicateException(cause: Throwable) : RuntimeException("Member account duplicate", cause)
