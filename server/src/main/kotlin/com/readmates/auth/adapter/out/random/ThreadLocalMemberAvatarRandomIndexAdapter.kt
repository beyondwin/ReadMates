package com.readmates.auth.adapter.out.random

import com.readmates.auth.application.port.out.MemberAvatarRandomIndexPort
import org.springframework.stereotype.Component
import java.util.concurrent.ThreadLocalRandom

@Component
class ThreadLocalMemberAvatarRandomIndexAdapter : MemberAvatarRandomIndexPort {
    override fun nextIndex(boundExclusive: Int): Int {
        require(boundExclusive > 0) { "boundExclusive must be positive" }
        return ThreadLocalRandom.current().nextInt(boundExclusive)
    }
}
